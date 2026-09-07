import { loginDestination } from "../../api/client";
import type {
  DevelopmentAccount,
  RuntimeEnvironment,
} from "../../api/contracts";
import { Field, Form } from "../../shared/ui";
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
  const employeePortal = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  )
    .get("next")
    ?.startsWith("/clinic");
  const done = () =>
    window.location.assign(
      loginDestination(new URLSearchParams(window.location.search).get("next")),
    );
  return (
    <main id="main" className="wrap inner-page login-layout">
      <div className="inner-page-copy">
        <p className="eyebrow">YOUR NEXT CHAPTER, ORGANIZED</p>
        <h1>
          {developmentLogin
            ? "Choose an account."
            : employeePortal
              ? "Your workday."
              : "Your launch."}
          <br />
          <em>
            {developmentLogin
              ? "Start testing immediately."
              : employeePortal
                ? "One place to work."
                : "One place to start."}
          </em>
        </h1>
        <p>
          {developmentLogin
            ? "Choose a patient, employee role, or Omni development access to enter the app without a password."
            : employeePortal
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
        {developmentLogin ? (
          <>
            <h2>Development account preview</h2>
            <p className="form-note">
              Choose a portal and account, then log in. Actions are recorded as
              that account.
            </p>
            <DevelopmentControls
              accounts={developmentAccounts}
              businessDate={businessDate}
            />
          </>
        ) : (
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
          </>
        )}
      </section>
    </main>
  );
}
