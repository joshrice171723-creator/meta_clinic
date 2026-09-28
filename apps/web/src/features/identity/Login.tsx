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
  return "clinic" as const;
}

export function Login({
  developmentLogin,
  developmentAccounts = [],
  environment = "unknown",
  businessDate = "",
  configurationError = false,
  ownerPinRequired = false,
}: {
  developmentLogin: boolean;
  developmentAccounts?: DevelopmentAccount[];
  environment?: RuntimeEnvironment;
  businessDate?: string;
  configurationError?: boolean;
  ownerPinRequired?: boolean;
}) {
  const returnTo = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).get("next");
  const credentialMode =
    ownerPinRequired &&
    new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    ).get("credentials") === "1";
  const ownerPortal = returnTo?.startsWith("/owner");
  const employeePortal = returnTo?.startsWith("/clinic");
  const membershipAccount = returnTo === "/memberships/account";
  const patientPortal =
    returnTo?.startsWith("/patient-portal") || membershipAccount;
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
      className={`wrap inner-page login-layout${developmentLogin && !credentialMode ? " development-login-layout" : ""}`}
    >
      <div className="inner-page-copy">
        <h1>
          Streamline your practice.
          <br />
          <em>Scale your organization.</em>
        </h1>
        <p>Your clinics, your team, and your workflows in one place.</p>
      </div>
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
        {developmentLogin && !credentialMode ? (
          <div className="login-development-tools">
            <h2>Development tools</h2>
            <Typography color="text.secondary" variant="body2">
              Choose an organization and account, or create a new organization.
            </Typography>
            <DevelopmentControls
              accounts={developmentAccounts}
              businessDate={businessDate}
              initialPortal={developmentPortalFor(returnTo)}
              ownerPinRequired={ownerPinRequired}
            />
            <Button href="/demo" variant="outlined">
              Open visitor demo
            </Button>
            <Typography color="text.secondary" variant="caption">
              Enter a shared synthetic clinic workspace. Visitors can reset it
              to its baseline, which removes everyone's changes.
            </Typography>
            {ownerPinRequired && (
              <p className="page-fine-print">
                <a href="/login?credentials=1&next=%2Fowner">
                  Owner account sign in
                </a>
              </p>
            )}
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
