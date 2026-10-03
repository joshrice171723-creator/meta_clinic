import { Button } from "@mui/material";

export function InquiryPrivacyPage() {
  return (
    <main id="main" className="growth-page__wrap inquiry-privacy">
      <nav aria-label="Breadcrumb">
        <a href="/meta-clinic">Meta Clinic</a> / Inquiry information
      </nav>
      <h1>Before you send a business inquiry.</h1>
      <p className="growth-page__lead">
        The contact and walkthrough forms ask for your name, work email, and a
        business message. Share only what the team needs to understand your
        question.
      </p>
      <section>
        <h2>What the form sends</h2>
        <p>
          Your entries and the page you submitted from are stored as an inquiry
          so the Meta Clinic team can review the request and use your contact
          details to reply. A hidden field helps reject automated submissions.
        </p>
      </section>
      <section>
        <h2>What to leave out</h2>
        <p>
          Do not submit patient records, medical details, passwords,
          payment-card details, or confidential attachments. These forms are for
          software and business questions, not care or urgent assistance.
        </p>
      </section>
      <section>
        <h2>What happens next</h2>
        <p>
          A confirmation means the inquiry was received. It does not book an
          appointment, create a subscription, or approve access to a clinic. If
          sending fails, your message stays in the form so you can retry.
        </p>
      </section>
      <section>
        <h2>Questions about your information</h2>
        <p>
          Use the contact form to ask about an earlier inquiry, correction,
          removal, or the applicable privacy terms. Identify the inquiry using
          your business email; do not include sensitive information. This page
          describes these two forms and is not a complete service-wide privacy
          policy.
        </p>
      </section>
      <Button href="/meta-clinic/contact" variant="contained">
        Contact Meta Clinic
      </Button>
      <Button href="/meta-clinic/security">Read about product controls</Button>
    </main>
  );
}
