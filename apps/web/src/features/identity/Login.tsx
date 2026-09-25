import { loginDestination } from "../../api/client";
import type {
  DevelopmentAccount,
  RuntimeEnvironment,
} from "../../api/contracts";
import { Field, Form } from "../../shared/ui";
import { Alert, Button, Typography } from "@mui/material";
import {
  DevelopmentControls,
  EnvironmentLabel,
} from "./DevelopmentAccountSwitcher";

function developmentPortalFor(returnTo: string | null) {
  if (returnTo?.startsWith("/owner")) return "owner" as const;
  if (returnTo?.startsWith("/clinic")) return "clinic" as const;
  if (returnTo?.startsWith("/patient-portal")) return "patient" as const;
  return "launch" as const;
}

export function Login({
  developmentLogin,
  developmentAccounts = [],
  environment = "unknown",
  businessDate = "",
  configurationError = false,
}: {
  developmentLogin: boolean;
  developmentAccounts?: DevelopmentAccount[];
  environment?: RuntimeEnvironment;
  businessDate?: string;
  configurationError?: boolean;
}) {
  const returnTo = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).get("next");
  const ownerPortal = returnTo?.startsWith("/owner");
  const employeePortal = returnTo?.startsWith("/clinic");
  const membershipAccount = returnTo === "/memberships/account";
  const patientPortal = returnTo?.startsWith("/patient-portal") || membershipAccount;
  const portalName = ownerPortal
    ? "Owner Command Center"
    : employeePortal
      ? "Clinic team workspace"
      : patientPortal
        ? "Patient portal"
        : "Launch & onboarding";
  const done = (result?: Record<string, unknown>) =>
    window.location.assign(
      loginDestination(
        typeof result?.destination === "string"
          ? result.destination
          : new URLSearchParams(window.location.search).get("next"),
      ),
    );
  return (
    <main
      id="main"
      className={`wrap inner-page login-layout${developmentLogin ? " development-login-layout" : ""}`}
    >
      {!developmentLogin && (
        <div className="inner-page-copy">
          <h1>
            {ownerPortal
              ? "Streamline your practice."
              : employeePortal
                ? "Your workday."
                : patientPortal
                  ? "Your care."
                  : "Your launch."}
            <br />
            <em>
              {ownerPortal
                ? "Scale your organization."
                : employeePortal
                  ? "One place to work."
                  : patientPortal
                    ? "One secure place."
                    : "One place to start."}
            </em>
          </h1>
          <p>
            {ownerPortal
              ? "Establish clinics and invite their first owners."
              : employeePortal
                ? "Sign in to work in your clinic and access the tools assigned to your team account."
                : patientPortal
                  ? "Sign in to view the patient portal access assigned by your clinic."
                  : "Sign in to review your paperwork and work through onboarding and training."}
          </p>
          {!developmentLogin && (
            <p className="page-fine-print">
              Clinic staff accounts are issued by the clinic. Membership
              customers can create an account from their clinic’s membership page.
            </p>
          )}
        </div>
      )}
      <section className="form-card login-card">
        <EnvironmentLabel environment={environment} />
        {configurationError && (
          <Alert
            severity="error"
            action={
              <Button color="inherit" onClick={() => window.location.reload()}>
                Retry
              </Button>
            }
          >
            Unable to load login options. Check the server connection and retry.
          </Alert>
        )}
        {developmentLogin ? (
          <div className="login-development-tools">
            <h2>Development tools</h2>
            <Typography color="text.secondary" variant="body2">
              Choose a local account and its permitted destination for this
              environment.
            </Typography>
            <DevelopmentControls
              accounts={developmentAccounts}
              businessDate={businessDate}
              initialPortal={developmentPortalFor(returnTo)}
            />
          </div>
        ) : (
          <>
            <div
              className="portal-type-links"
              aria-label="Choose your sign-in space"
            >
              <a
                aria-current={ownerPortal ? "page" : undefined}
                href="/login?next=%2Fowner"
              >
                Owner
              </a>
              <a
                aria-current={
                  !ownerPortal && !employeePortal && !patientPortal
                    ? "page"
                    : undefined
                }
                href="/login"
              >
                Launch &amp; onboarding
              </a>
              <a href="/memberships">Future patient</a>
              <a
                aria-current={patientPortal ? "page" : undefined}
                href="/login?next=%2Fpatient-portal"
              >
                Patient portal
              </a>
              <a
                aria-current={employeePortal ? "page" : undefined}
                href="/login?next=%2Fclinic"
              >
                Clinic team
              </a>
            </div>
            <p className="page-fine-print">
              <a href="/memberships">
                New to a clinic? Explore membership options without an account.
              </a>
            </p>
            <h2>{portalName}</h2>
            <p>
              {ownerPortal
                ? "Meta Clinic owners use their platform account to manage organizations and clinics."
                : employeePortal
                  ? "Clinic employees use the account provided by their organization."
                  : patientPortal
                    ? "Patients use the account activated from their clinic invitation."
                    : "Use this account for launch paperwork, onboarding, and training. Clinic team access is separate."}
            </p>
            <Form endpoint="/api/session" submit="Sign in" onSuccess={done}>
              <Field
                name="email_address"
                label="Email address"
                type="email"
                maxLength={254}
                autoComplete="username"
              />
              <Field
                name="password"
                label="Password"
                type="password"
                autoComplete="current-password"
              />
            </Form>
            {patientPortal && (
              <p>
                <a href="/patient-portal/recovery">
                  Forgot patient portal password?
                </a>
              </p>
            )}
            {ownerPortal && (
              <p>
                <a href="/owner/password-reset">Forgot owner password?</a>
              </p>
            )}
            {(employeePortal ||
              (developmentLogin && !ownerPortal && !patientPortal)) && (
              <p>
                <a href="/workforce/activate">Activate employee account</a>
              </p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
