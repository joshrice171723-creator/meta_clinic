import { loginDestination } from "../../api/client";
import { Field, Form } from "../../shared/ui";

export function Login({ developmentLogin }: { developmentLogin: boolean }) {
  const done = () =>
    window.location.assign(
      loginDestination(new URLSearchParams(window.location.search).get("next")),
    );
  return (
    <main id="main" className="wrap inner-page login-layout">
      <div className="inner-page-copy">
        <p className="eyebrow">YOUR NEXT CHAPTER, ORGANIZED</p>
        <h1>
          Your launch.
          <br />
          <em>One place to start.</em>
        </h1>
        <p>
          Sign in to review your paperwork and work through onboarding and
          training.
        </p>
        <p className="page-fine-print">
          APPly provides your account after payment. There is no public signup.
          Need access help? <a href="/contact">Contact us.</a>
        </p>
      </div>
      <section className="form-card login-card">
        <h2>Welcome back.</h2>
        <p>Use the login provided by APPly.</p>
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
        {developmentLogin && (
          <>
            <hr />
            <h3>Reusable local test logins</h3>
            <Form
              endpoint="/api/development_session"
              submit="OmniLogin"
              onSuccess={done}
              values={{ profile: "omni" }}
            />
            <p className="form-note">
              One synthetic clinic identity for rapid review. After login, use
              Settings → Development view to swap between administrator,
              clinician, staff, inventory, read-only and client views.
            </p>
            <Form
              endpoint="/api/development_session"
              submit="Use test login"
              onSuccess={done}
            >
              <Field
                name="profile"
                label="Test account"
                options={[
                  ["client-a", "Test Client A"],
                  ["client-b", "Test Client B"],
                  ["patient", "Synthetic Patient Portal"],
                  ["admin", "Test Admin — inquiry inbox"],
                  ["disabled", "Test Disabled — expected sign-in denial"],
                ]}
              />
            </Form>
            <Form
              endpoint="/api/development_session"
              submit="Open synthetic patient portal"
              onSuccess={() => window.location.assign("/patient-portal")}
              values={{ profile: "patient" }}
            />
            <p className="form-note">
              Local synthetic accounts only; no password needed. Client A and B
              retain separate progress and test clinics. Test Admin has inbox
              access, not clinic access. Sessions end 12 hours after login.
            </p>
            <Form
              endpoint="/api/development_session"
              submit="Continue as demo client"
              onSuccess={done}
            />
            <p className="form-note">
              Development only. Creates a fresh synthetic walkthrough with an
              assigned Test Clinic. No password or ChatGPT sign-in needed.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
