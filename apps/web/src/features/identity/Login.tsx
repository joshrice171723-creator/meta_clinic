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
