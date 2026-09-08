import { Field, Form } from "../../shared/ui";

export function Contact() {
  return (
    <main id="main" className="wrap inner-page contact-layout">
      <div className="inner-page-copy">
        <p className="eyebrow">LET'S FIND YOUR NEXT STEP</p>
        <h1>
          Your clinic starts
          <br />
          with <em>a conversation.</em>
        </h1>
        <p>
          Thinking about a cash-pay practice? Tell us about your goals and where
          you are in the process.
        </p>
        <p>
          Sherman &amp; North Texas · Clinic-launch support for nurse
          practitioners and physician assistants.
        </p>
        <p className="page-fine-print">
          Synthetic business inquiries only during development. Do not send
          patient information, medical questions, passwords, or confidential
          documents. Not monitored for emergencies.
        </p>
      </div>
      <section className="form-card">
        <h2>Get in touch.</h2>
        <Form endpoint="/api/contact_messages" submit="Send inquiry">
          <Field name="contact_message[name]" label="Name" maxLength={100} />
          <Field
            name="contact_message[email]"
            label="Email address"
            type="email"
            maxLength={254}
          />
          <Field
            name="contact_message[message]"
            label="What are you working toward?"
            type="textarea"
            maxLength={4000}
          />
          <div className="honeypot" aria-hidden="true">
            <label htmlFor="website">Leave this empty</label>
            <input
              id="website"
              name="contact_message[website]"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
          <p className="form-note">
            Use fictional details only. Your message is saved to APPly's inquiry
            inbox; no email notification is sent yet.
          </p>
        </Form>
      </section>
    </main>
  );
}
