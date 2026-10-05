import { useEffect, useState } from "react";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ThemeProvider,
} from "@mui/material";
import { MembershipCatalog } from "../patientPortal/MembershipCatalog";
import { membershipTheme } from "../clinic/subscriptions/membershipTheme";
import type { PublishedPackage } from "../clinic/subscriptions/contracts";
import "./membershipPatientView.css";

const sampleMembership: PublishedPackage = {
  id: 1,
  number: 1,
  program: {
    id: 1,
    name: "Primary care",
    description: "Ongoing care options from Northside Clinic.",
    display_order: 0,
  },
  terms: {
    family_id: 1,
    family_name: "Primary care",
    package_id: 1,
    package_name: "Primary care membership",
    description: "",
    tier: "Primary care membership",
    amount: "79.00",
    currency: "USD",
    duration: 1,
    duration_unit: "months",
    renewal: "none",
    cancellation: "end_of_term",
    refund_policy: "manual_review",
    terms: "",
    eligibility_review: false,
    max_per_patient: 1,
    available_from: null,
    available_until: null,
    components: [
      {
        service_id: 1,
        name: "Primary care follow-up",
        description: "",
        mode: "included",
        group: "",
        min: 0,
        max: 0,
        quantity: 1,
        frequency: "term",
        price_adjustment: "0.00",
        eligibility_review: false,
      },
    ],
  },
};

export function MembershipPatientView({
  capture = false,
}: {
  capture?: boolean;
}) {
  const [selected, setSelected] = useState(false);
  useEffect(() => {
    const previousTitle = document.title;
    const robots =
      document.querySelector<HTMLMetaElement>('meta[name="robots"]') ??
      document.head.appendChild(document.createElement("meta"));
    const previousRobots = robots.getAttribute("content");
    robots.setAttribute("name", "robots");
    robots.setAttribute("content", "noindex,follow");
    document.title = "Patient membership view | Meta Clinic";
    return () => {
      document.title = previousTitle;
      if (previousRobots === null) robots.remove();
      else robots.setAttribute("content", previousRobots);
    };
  }, []);
  return (
    <ThemeProvider theme={membershipTheme}>
      <main
        id="main"
        className={`membership-patient ${capture ? "membership-patient--capture" : ""}`}
      >
        <header className="membership-patient__topbar">
          <a
            href="/meta-clinic/platform/memberships"
            aria-label="Back to Meta Clinic memberships"
          >
            Meta Clinic<span aria-hidden="true">·</span>
          </a>
          <span>Patient view</span>
        </header>
        <div className="membership-patient__wrap">
          {!capture && (
            <a
              className="membership-patient__back"
              href="/meta-clinic/platform/memberships"
            >
              ← How clinics build a membership
            </a>
          )}
          <section
            className="membership-patient__intro"
            aria-labelledby="patient-view-title"
          >
            <div>
              <p className="membership-patient__eyebrow">
                The patient side of the membership
              </p>
              <h1 id="patient-view-title">
                A clear offer before a patient chooses.
              </h1>
            </div>
            <p>
              This sample uses the published primary care tier from the
              synthetic clinic catalog. Patients compare the price, renewal, and
              included services before starting account setup.
            </p>
          </section>
          <div className="membership-patient__clinic-bar">
            <strong>Northside Clinic</strong>
            <span>Memberships offered by this clinic</span>
          </div>
          <div className="membership-patient__offer-grid">
            <MembershipCatalog
              catalog={[sampleMembership]}
              busy={false}
              canPurchase
              onChoose={() => setSelected(true)}
            />
            <aside
              className="membership-patient__path"
              aria-label="How a patient purchases a membership"
            >
              <span>From choice to checkout</span>
              <h2>Know the next step before you choose.</h2>
              <ol>
                <li>
                  <strong>Choose the membership</strong>
                  <p>Review the price, term, and included care.</p>
                </li>
                <li>
                  <strong>Create your account</strong>
                  <p>Enter your details and verify your email.</p>
                </li>
                <li>
                  <strong>Review checkout</strong>
                  <p>Confirm the selection and amount before payment.</p>
                </li>
              </ol>
            </aside>
          </div>
          <div className="membership-patient__next">
            <span>After choosing</span>
            <p>
              Review the selected terms → create a patient account → verify
              email → continue to checkout.
            </p>
          </div>
        </div>
        <Dialog
          open={selected}
          onClose={() => setSelected(false)}
          aria-labelledby="membership-preview-title"
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle id="membership-preview-title">
            Choose how to continue
          </DialogTitle>
          <DialogContent>
            <p className="membership-patient__dialog-copy">
              The patient flow shows the selected membership and its terms
              before asking for contact details. A patient can ask the clinic to
              contact them, or create an account and continue to checkout after
              email verification.
            </p>
            <p className="membership-patient__dialog-note">
              Explore the guided demo to follow account setup and checkout with
              sample clinic records.
            </p>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelected(false)}>
              Back to membership
            </Button>
            <Button
              href="/meta-clinic/demo"
              variant="contained"
              endIcon={<ArrowForwardRoundedIcon />}
            >
              Try Our Sandbox
            </Button>
          </DialogActions>
        </Dialog>
      </main>
    </ThemeProvider>
  );
}
