import { loginDestination } from "../../api/client";
import type {
  DevelopmentAccount,
  RuntimeEnvironment,
} from "../../api/contracts";
import { Field, Form } from "../../shared/ui";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Typography,
} from "@mui/material";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import {
  DevelopmentControls,
  EnvironmentLabel,
} from "./DevelopmentAccountSwitcher";

export function Login({
  developmentLogin,
  developmentAccounts = [],
  environment = "unknown",
  businessDate = "",
}: {
  developmentLogin: boolean;
  developmentAccounts?: DevelopmentAccount[];
  environment?: RuntimeEnvironment;
  businessDate?: string;
}) {
  const returnTo = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).get("next");
  const ownerPortal = returnTo?.startsWith("/owner");
  const employeePortal = returnTo?.startsWith("/clinic");
  const patientPortal = returnTo?.startsWith("/patient-portal");
  const portalName = ownerPortal
    ? "Owner Command Center"
    : employeePortal
      ? "Clinic team workspace"
      : patientPortal
        ? "Patient portal"
        : "Launch & onboarding";
  const done = () =>
    window.location.assign(
      loginDestination(new URLSearchParams(window.location.search).get("next")),
    );
  return (
    <main id="main" className="wrap inner-page login-layout">
      <div className="inner-page-copy">
        <h1>
          {ownerPortal
            ? "Your organizations."
            : employeePortal
              ? "Your workday."
              : patientPortal
                ? "Your care."
                : "Your launch."}
          <br />
          <em>
            {ownerPortal
              ? "One place to lead."
              : employeePortal
                ? "One place to work."
                : patientPortal
                  ? "One secure place."
                  : "One place to start."}
          </em>
        </h1>
        <p>
          {ownerPortal
            ? "Sign in to establish clinics and invite their first owners."
            : employeePortal
              ? "Sign in to work in your clinic and access the tools assigned to your team account."
              : patientPortal
                ? "Sign in to view the patient portal access assigned by your clinic."
                : "Sign in to review your paperwork and work through onboarding and training."}
        </p>
        {!developmentLogin && (
          <p className="page-fine-print">
            Meta Clinic issues accounts directly. There is no public signup.
          </p>
        )}
      </div>
      <section className="form-card login-card">
        <EnvironmentLabel environment={environment} />
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
          {(employeePortal ||
            (developmentLogin && !ownerPortal && !patientPortal)) && (
            <p>
              <a href="/workforce/activate">Activate employee account</a>
            </p>
          )}
        </>
        {developmentLogin && (
          <Accordion
            disableGutters
            elevation={0}
            sx={{
              mt: 3,
              borderTop: 1,
              borderColor: "divider",
              "&::before": { display: "none" },
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreOutlinedIcon />}
              aria-controls="login-development-tools"
              id="login-development-heading"
            >
              <Typography sx={{ fontWeight: 600 }}>
                Development tools
              </Typography>
            </AccordionSummary>
            <AccordionDetails id="login-development-tools">
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Choose a local account for this environment. Actions are
                recorded as that account.
              </Typography>
              <DevelopmentControls
                accounts={developmentAccounts}
                businessDate={businessDate}
                returnTo={returnTo}
              />
            </AccordionDetails>
          </Accordion>
        )}
      </section>
    </main>
  );
}
