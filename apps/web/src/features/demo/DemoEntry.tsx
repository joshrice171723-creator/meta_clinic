import type { ReactNode } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  LinearProgress,
} from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { MetaClinicMarketing } from "../marketing/MetaClinicMarketing";
import "./demoEntry.css";

export function DemoEntryLoading() {
  return (
    <DemoEntry>
      <div className="demo-entry__loading" role="status" aria-live="polite">
        <h2>Getting the clinic ready</h2>
        <LinearProgress aria-label="Loading the Meta Clinic demo" />
        <p>Checking your session and the shared workspace.</p>
        <Button variant="text" onClick={() => window.location.reload()}>
          Reload if this takes too long
        </Button>
      </div>
    </DemoEntry>
  );
}

export function DemoEntry({ children }: { children: ReactNode }) {
  return (
    <MetaClinicMarketing title="Explore the working demo - Meta Clinic">
      <main id="main" className="demo-entry meta-marketing__section">
        <section
          className="demo-entry__intro"
          aria-labelledby="demo-entry-title"
        >
          <h1 id="demo-entry-title">
            See a clinic day <em>come together.</em>
          </h1>
          <p className="demo-entry__lead">
            From the first appointment to the final follow-up. Explore how
            patient care, your team, and the business of a clinic connect.
          </p>
          <ol className="demo-entry__journey" aria-label="What to expect">
            <li>
              <span>01</span>
              <div>
                <strong>Choose your perspective</strong>
                <p>Step into the workspace as clinic staff or a patient.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Follow the work</strong>
                <p>
                  Explore appointments, patient records, billing, and inventory.
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Make yourself at home</strong>
                <p>
                  Try the tools at your own pace. Switch accounts as you
                  explore.
                </p>
              </div>
            </li>
          </ol>
          <Button
            className="demo-entry__tour-link"
            href="/meta-clinic/platform"
            endIcon={<ArrowForwardRoundedIcon />}
          >
            Get to know the platform
          </Button>
        </section>
        <section className="demo-entry__panel" aria-label="Open the demo">
          {children}
        </section>
        <aside className="demo-entry__notes" aria-label="About this demo">
          <div className="demo-entry__shared">
            <h2>A shared space to explore</h2>
            <p>
              People and records in this demo are fictional. Changes are shared
              with other visitors. Please keep real patient and sensitive
              information out of this workspace.
            </p>
          </div>
          <Accordion
            disableGutters
            elevation={0}
            className="demo-entry__reset-note"
          >
            <AccordionSummary
              expandIcon={<ExpandMoreRoundedIcon />}
              aria-controls="demo-reset-details"
              id="demo-reset-summary"
            >
              How demo resets work
            </AccordionSummary>
            <AccordionDetails id="demo-reset-details">
              A nightly refresh is scheduled, but depends on the reset service
              being ready and may not run every night. A reset removes shared
              changes and can end active sessions.
            </AccordionDetails>
          </Accordion>
        </aside>
      </main>
    </MetaClinicMarketing>
  );
}
