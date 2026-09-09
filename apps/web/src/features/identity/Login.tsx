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
  const employeePortal = returnTo?.startsWith("/clinic");
  const done = () =>
    window.location.assign(
      loginDestination(new URLSearchParams(window.location.search).get("next")),
    );
  return (
    <main id="main" className="wrap inner-page login-layout">
      <div className="inner-page-copy">
        <h1>
          {employeePortal ? "Your workday." : "Your launch."}
          <br />
          <em>
            {employeePortal ? "One place to work." : "One place to start."}
          </em>
        </h1>
        <p>
          {employeePortal
            ? "Sign in to work in your clinic and access the employee tools assigned to your account."
            : "Sign in to review your paperwork and work through onboarding and training."}
        </p>
        {!developmentLogin && (
          <p className="page-fine-print">
            APPly provides your account after payment. There is no public
            signup. Need access help? <a href="/contact">Contact us.</a>
          </p>
        )}
      </div>
      <section className="form-card login-card">
        <EnvironmentLabel environment={environment} />
        <>
          <div className="portal-type-links" aria-label="Choose account type">
            <a
              aria-current={!employeePortal ? "page" : undefined}
              href="/login"
            >
              Customer portal
            </a>
            <a
              aria-current={employeePortal ? "page" : undefined}
              href="/login?next=%2Fclinic"
            >
              Employee portal
            </a>
          </div>
          <h2>{employeePortal ? "Employee portal" : "Customer portal"}</h2>
          <p>
            {employeePortal
              ? "Clinic employees use the account provided by their organization."
              : "Customers use the account provided by APPly."}
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
          {(developmentLogin || employeePortal) && (
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
